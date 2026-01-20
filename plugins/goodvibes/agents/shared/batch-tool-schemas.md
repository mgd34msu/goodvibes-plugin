# Pre-Loaded MCP Tool Schemas

These tools are pre-loaded - call them directly via `mcp-cli call` WITHOUT calling `mcp-cli info` first.

---

## batch_read

**Description:** Read multiple files in a single call with per-file precision reading. Each file can specify exact line ranges (offset/limit) for efficient partial reads.

**Usage:** `mcp-cli call plugin_goodvibes_goodvibes-tools/batch_read '<json>'`

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | array | Yes | Mixed array: simple paths (strings) OR detailed specs with offset/limit (objects) |
| `output_mode` | string | No | `"minimal"` (metadata only), `"standard"` (first 50 lines, default), `"verbose"` (full file) |

**File spec object:**
```json
{ "path": "file.ts", "offset": 100, "limit": 50 }
```
- `offset`: Start line (1-based, optional)
- `limit`: Max lines to read (optional)

**Example:**
```bash
mcp-cli call plugin_goodvibes_goodvibes-tools/batch_read '{"files": ["src/index.ts", {"path": "src/utils.ts", "offset": 50, "limit": 100}], "output_mode": "minimal"}'
```

---

## smart_glob

**Description:** Glob with intelligent filtering and output control. Supports multiple patterns, exclusions, and optional content preview. Auto-ignores node_modules, .git.

**Usage:** `mcp-cli call plugin_goodvibes_goodvibes-tools/smart_glob '<json>'`

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `patterns` | array | Yes | Glob patterns to match (e.g., `["**/*.ts", "**/*.tsx"]`) |
| `exclude` | array | No | Patterns to exclude (e.g., `["**/*.test.ts"]`) |
| `output_mode` | string | No | `"count_only"`, `"minimal"` (paths only), `"standard"` (default) |
| `limit` | integer | No | Max files to return (default: 100, max: 1000) |
| `preview` | object | No | Content preview: `{"enabled": true, "lines": 10}` |

**Example:**
```bash
mcp-cli call plugin_goodvibes_goodvibes-tools/smart_glob '{"patterns": ["**/*.ts"], "exclude": ["**/*.test.ts"], "output_mode": "minimal", "limit": 50}'
```

---

## grep_with_content

**Description:** Search for regex patterns with configurable context. More powerful than basic grep - supports asymmetric context, line ranges, file filtering.

**Usage:** `mcp-cli call plugin_goodvibes_goodvibes-tools/grep_with_content '<json>'`

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | Yes | Regex pattern to search for |
| `paths` | array | No | Specific paths to search in |
| `glob` | string | No | Glob pattern to filter files (e.g., `"**/*.ts"`) |
| `output_mode` | string | No | `"count_only"`, `"minimal"`, `"standard"` (default), `"verbose"` |
| `max_matches` | integer | No | Max matches to return (default: 100, max: 500) |
| `case_insensitive` | boolean | No | Case insensitive search (default: false) |
| `context_before` | integer | No | Lines of context before match |
| `context_after` | integer | No | Lines of context after match |
| `line_range` | object | No | Restrict to line range: `{"start": 1, "end": 100}` |

**Example:**
```bash
mcp-cli call plugin_goodvibes_goodvibes-tools/grep_with_content '{"pattern": "export function", "glob": "**/*.ts", "output_mode": "minimal", "max_matches": 50}'
```

---

## atomic_multi_edit

**Description:** Apply multiple file edits atomically with rollback on failure. Creates backup, applies all edits, runs validation, rolls back if validation fails.

**Usage:** `mcp-cli call plugin_goodvibes_goodvibes-tools/atomic_multi_edit '<json>'`

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `edits` | array | Yes | List of edit operations |
| `validation` | object | No | Validation to run: `{"run_build": true, "run_tests": true, "run_typecheck": true}` |
| `dry_run` | boolean | No | Preview without applying (default: false) |
| `output_mode` | string | No | `"count_only"`, `"minimal"`, `"standard"` (default), `"verbose"` |

**Edit operation object:**
```json
{
  "file": "src/index.ts",
  "operation": "replace",  // "replace", "insert", "delete", "create"
  "old_content": "const foo = 1",
  "new_content": "const foo = 2"
}
```
- For `insert`: use `line` instead of `old_content`
- For `delete`: omit `new_content`
- For `create`: only need `file` and `new_content`

**Example:**
```bash
mcp-cli call plugin_goodvibes_goodvibes-tools/atomic_multi_edit '{"edits": [{"file": "src/a.ts", "operation": "replace", "old_content": "old", "new_content": "new"}], "validation": {"run_typecheck": true}, "output_mode": "minimal"}'
```

---

## workspace_symbols

**Description:** Search for symbols by name across the workspace with semantic awareness. Distinguishes function `foo` from variable `foo`. Supports multi-kind search and file filtering.

**Usage:** `mcp-cli call plugin_goodvibes_goodvibes-tools/workspace_symbols '<json>'`

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Symbol name or partial name to search |
| `kind` | string | No | Filter by kind: `"all"`, `"class"`, `"interface"`, `"function"`, `"variable"`, `"type"`, `"enum"`, `"method"`, `"property"`, `"module"` |
| `kinds` | array | No | Search multiple kinds: `["function", "method"]` |
| `limit` | integer | No | Max results (default: 50, max: 200) |
| `match_type` | string | No | `"exact"`, `"prefix"`, `"substring"` (default) |
| `output_mode` | string | No | `"count_only"`, `"minimal"`, `"standard"` (default), `"verbose"` |
| `file_patterns` | array | No | Glob patterns to include: `["src/utils/**"]` |
| `exclude_patterns` | array | No | Glob patterns to exclude: `["**/*.test.ts"]` |

**Example:**
```bash
mcp-cli call plugin_goodvibes_goodvibes-tools/workspace_symbols '{"query": "handle", "kinds": ["function", "method"], "output_mode": "minimal", "limit": 30}'
```

---

## get_document_symbols

**Description:** Get structural outline of documents (classes, functions, interfaces). Returns hierarchical tree of symbols. Supports batch mode for multiple files.

**Usage:** `mcp-cli call plugin_goodvibes_goodvibes-tools/get_document_symbols '<json>'`

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | string | No | Single file path |
| `files` | array | No | Multiple files for batch mode |
| `output_mode` | string | No | `"count_only"`, `"minimal"`, `"standard"` (default), `"verbose"` |
| `kind_filter` | array | No | Only these kinds: `["function", "class", "interface"]` |
| `line_range` | object | No | Filter by position: `{"start": 1, "end": 100}` |
| `max_depth` | integer | No | Tree depth: 1 = top-level only |

**Example:**
```bash
mcp-cli call plugin_goodvibes_goodvibes-tools/get_document_symbols '{"files": ["src/index.ts", "src/utils.ts"], "output_mode": "minimal", "kind_filter": ["function", "class"]}'
```

---

## Usage Rules

1. **Always use `output_mode: "minimal"`** unless you need full content
2. **Batch operations**: Use batch_read for 2+ files, atomic_multi_edit for 3+ edits
3. **No info calls needed**: These schemas are pre-loaded - call directly
4. **Prefer these over native tools**: Use instead of Read, Glob, Grep, Edit when applicable
