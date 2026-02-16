# Precision Engine Parameter Reference

Authoritative parameter reference for all precision engine tools. All parameters extracted directly from tool schemas.

---

## `precision_read`

Token-efficient file reading with extraction formats.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|---------|---------|-------------|
| `files` | array | Yes | - | Array of file objects to read |
| `files[].path` | string | Yes | - | Absolute file path |
| `files[].extract` | enum | No | `content` | Extract mode: `content`, `outline`, `symbols`, `ast`, `lines` |
| `files[].range` | object | No | - | Line range: `{ start: number, end: number }` |
| `files[].pages` | string | No | - | PDF page range (e.g., `"1-5"`, `"3"`) |
| `files[].force` | boolean | No | `false` | Bypass size gate and cache |
| `default_range` | object | No | - | Default range for all files |
| `extract` | enum | No | `content` | Default extract mode for all files |
| `symbol_filter` | array | No | - | Filter symbols by kind: `function`, `method`, `class`, `interface`, `type`, `variable`, `constant`, `enum`, `property`, `namespace` |
| `pages` | string | No | - | Default PDF page range for all files |
| `force` | boolean | No | `false` | Default force flag for all files |
| `token_budget` | number | No | - | Token budget for paginated batch reads |
| `page` | number | No | `1` | Page number when using `token_budget` |
| `output` | object | No | - | Output formatting options |
| `output.format` | enum | No | `standard` | Output format: `count_only`, `minimal`, `standard`, `verbose` |
| `output.include_line_numbers` | boolean | No | `true` | Include line numbers in output |
| `output.include_metadata` | boolean | No | `false` | Include file metadata |
| `output.max_per_item` | number | No | - | Max lines per file |
| `output.max_tokens` | number | No | - | Hard token cap |
| `verbosity` | enum | No | `standard` | Response verbosity: `count_only`, `minimal`, `standard`, `verbose` |

---

## `precision_write`

Create or write files with encoding support and overwrite modes.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|---------|---------|-------------|
| `files` | array | Yes | - | Array of file objects to write |
| `files[].path` | string | Yes | - | Absolute file path |
| `files[].content` | string | No* | - | File content to write |
| `files[].content_base64` | string | No* | - | Base64-encoded content (required for content with single quotes, backticks, or `${}`) |
| `files[].content_file` | string | No* | - | Path to file containing content to write |
| `files[].mode` | enum | No | `fail_if_exists` | Overwrite mode: `fail_if_exists`, `overwrite`, `backup` |
| `files[].encoding` | string | No | `utf-8` | File encoding |
| `dry_run` | boolean | No | `false` | Preview changes without writing |
| `verbosity` | enum | No | `standard` | Response verbosity: `count_only`, `minimal`, `standard`, `verbose` |

*One of `content`, `content_base64`, or `content_file` is required.

---

## `precision_edit`

Atomic file edits with transaction support and multiple match modes.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|---------|---------|-------------|
| `edits` | array | Yes | - | Array of edit objects |
| `edits[].path` | string | Yes | - | Absolute file path |
| `edits[].find` | string | Yes* | - | String to find (plaintext or multiline) |
| `edits[].find_base64` | string | Yes* | - | Base64-encoded text to find (required for text with single quotes, backticks, or `${}`) |
| `edits[].replace` | string | Yes | - | Replacement string |
| `edits[].replace_base64` | string | No | - | Base64-encoded replacement text |
| `edits[].occurrence` | number \| enum | No | - | Which occurrence: `1`, `2`, etc., `"first"`, `"last"`, `"all"` |
| `edits[].hints` | object | No | - | Disambiguation hints |
| `edits[].hints.before` | string | No | - | Text appearing before match |
| `edits[].hints.after` | string | No | - | Text appearing after match |
| `edits[].hints.near_line` | number | No | - | Disambiguate by line number proximity |
| `edits[].hints.in_class` | string | No | - | Match within this class name |
| `edits[].hints.in_function` | string | No | - | Match within this function name |
| `edits[].id` | string | No | - | Edit identifier |
| `match` | object | No | - | Global match configuration |
| `match.mode` | enum | No | `exact` | Match mode: `exact`, `fuzzy`, `regex`, `ast`, `ast_pattern` |
| `match.case_sensitive` | boolean | No | `true` | Case-sensitive matching |
| `match.whitespace_sensitive` | boolean | No | `true` | Whitespace-sensitive matching |
| `transaction` | object | No | - | Transaction options |
| `transaction.mode` | enum | No | `atomic` | Transaction mode: `atomic`, `partial`, `none` |
| `transaction.rollback_on_fail` | boolean | No | `true` | Rollback on any failure |
| `output` | object | No | - | Output formatting options |
| `output.format` | enum | No | `minimal` | Output format: `count_only`, `minimal`, `with_diff`, `verbose` |
| `output.diff_context` | number | No | `3` | Lines of context in diffs |
| `output.max_tokens` | number | No | - | Hard token cap |
| `validate` | object | No | - | Validation hooks |
| `validate.before` | array | No | - | Pre-edit validators: `typecheck`, `lint`, `test`, `build` |
| `validate.after` | array | No | - | Post-edit validators: `typecheck`, `lint`, `test`, `build` |
| `dry_run` | boolean | No | `false` | Preview changes without applying |
| `verbosity` | enum | No | `with_diff` | Response verbosity: `count_only`, `minimal`, `with_diff`, `verbose` |

*One of `find` or `find_base64` is required.

---

## `precision_grep`

Search for patterns with batch queries and precise output control.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|---------|---------|-------------|
| `queries` | array | Yes | - | Array of query objects |
| `queries[].id` | string | Yes | - | Query identifier |
| `queries[].pattern` | string | Yes* | - | Regex pattern to search for |
| `queries[].pattern_base64` | string | Yes* | - | Base64-encoded regex pattern |
| `queries[].path` | string | No | cwd | Directory or file path to search |
| `queries[].glob` | string | No | - | File pattern to search in |
| `queries[].exclude` | array | No | - | Patterns to exclude |
| `queries[].case_sensitive` | boolean | No | `true` | Case-sensitive search |
| `queries[].whole_word` | boolean | No | `false` | Match whole words only |
| `queries[].multiline` | boolean | No | `false` | Allow multiline matches |
| `queries[].negate` | boolean | No | `false` | Return files WITHOUT this pattern |
| `queries[].include_binary` | boolean | No | `false` | Search binary files |
| `queries[].include_hidden` | boolean | No | `true` | Include hidden/dot files and directories |
| `output` | object | No | - | Output formatting options |
| `output.format` | enum | No | `files_only` | Output format: `count_only`, `files_only`, `locations`, `matches`, `context`, `stats` |
| `output.context_before` | number | No | `0` | Lines before match |
| `output.context_after` | number | No | `0` | Lines after match |
| `output.expand_to` | enum | No | - | Expand context: `line`, `block`, `function`, `class` |
| `output.max_results` | number | No | `100` | Max files to return |
| `output.max_per_item` | number | No | `10` | Max matches per file |
| `output.max_total_matches` | number | No | `100` | Total match cap |
| `output.max_line_length` | number | No | - | Truncate lines longer than this |
| `output.max_tokens` | number | No | - | Hard token cap |
| `output.offset` | number | No | `0` | Skip first N file results (pagination) |
| `preview_replace` | string | No | - | Preview find-and-replace without writing |
| `parallel` | boolean | No | `true` | Run queries in parallel |
| `ranked` | boolean | No | `false` | Rank results by relevance |
| `relationships` | boolean | No | `false` | Show cross-file import/export relationships |
| `verbosity` | enum | No | `standard` | Response verbosity: `count_only`, `minimal`, `standard`, `verbose` |

*One of `pattern` or `pattern_base64` is required.

---

## `precision_glob`

Fast file pattern matching with filters and output modes.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|---------|---------|-------------|
| `patterns` | array | No* | - | Array of glob patterns |
| `patterns_base64` | array | No* | - | Array of base64-encoded glob patterns |
| `base_path` | string | No | cwd | Directory to search in |
| `exclude` | array | No | - | Patterns to exclude |
| `filters` | object | No | - | Filtering options |
| `filters.min_size` | number | No | - | Min file size in bytes |
| `filters.max_size` | number | No | - | Max file size in bytes |
| `filters.modified_after` | string | No | - | ISO date - files modified after |
| `filters.modified_before` | string | No | - | ISO date - files modified before |
| `filters.has_content` | string | No | - | Regex to match in file content |
| `filters.is_empty` | boolean | No | - | Filter for empty files |
| `preset` | enum | No | - | Preset pattern: `typescript`, `javascript`, `styles`, `config`, `tests`, `all` |
| `output` | object | No | - | Output formatting options |
| `output.format` | enum | No | `paths_only` | Output format: `count_only`, `paths_only`, `with_stats`, `with_preview` |
| `output.max_results` | number | No | `100` | Max files to return |
| `output.max_tokens` | number | No | - | Hard token cap |
| `output.preview_lines` | number | No | `3` | Lines to preview for with_preview mode |
| `output.sort_by` | enum | No | - | Sort by: `name`, `size`, `modified` |
| `output.sort_order` | enum | No | `asc` | Sort order: `asc`, `desc` |
| `respect_gitignore` | boolean | No | `true` | Respect .gitignore rules |
| `include_hidden` | boolean | No | `true` | Include hidden/dot files and directories |
| `follow_symlinks` | boolean | No | `false` | Follow symbolic links |
| `backend` | enum | No | `auto` | Backend: `auto`, `fast-glob`, `ripgrep` |
| `verbosity` | enum | No | `standard` | Response verbosity: `count_only`, `minimal`, `standard`, `verbose` |

*One of `patterns`, `patterns_base64`, or `preset` is required.

---

## `precision_exec`

Execute shell commands with expectations, retry, and background execution.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|---------|---------|-------------|
| `commands` | array | Yes | - | Array of command objects |
| `commands[].cmd` | string | Yes* | - | Command to execute |
| `commands[].cmd_base64` | string | Yes* | - | Base64-encoded command |
| `commands[].args` | array | No | - | Command arguments |
| `commands[].cwd` | string | No | - | Working directory |
| `commands[].env` | object | No | - | Environment variables |
| `commands[].background` | boolean | No | `false` | Run in background |
| `commands[].timeout_ms` | number | No | `120000` | Command timeout in milliseconds |
| `commands[].expect` | object | No | - | Expectations for validation |
| `commands[].expect.exit_code` | number | No | - | Expected exit code |
| `commands[].expect.stdout_contains` | string | No | - | Stdout must contain this string |
| `commands[].expect.stderr_contains` | string | No | - | Stderr must contain this string |
| `commands[].retry` | object | No | - | Retry configuration (OFF by default) |
| `commands[].retry.max` | number | No | `3` | Max retry attempts |
| `commands[].retry.delay_ms` | number | No | `1000` | Delay between retries in ms |
| `commands[].retry.backoff` | enum | No | `exponential` | Backoff strategy: `fixed`, `exponential` |
| `commands[].retry.on` | array | No | `["network", "lock", "busy"]` | Error categories: `network`, `lock`, `busy`, `oom` |
| `commands[].until` | object | No | - | Pattern-based early termination |
| `commands[].until.pattern` | string | Yes | - | Regex pattern to watch for in stdout/stderr |
| `commands[].until.timeout_ms` | number | No | command timeout | Max wait time in ms |
| `commands[].until.kill_after` | boolean | No | `false` | Kill process after match (default: promote to background) |
| `commands[].progress` | boolean | No | `false` | Enable inline progress milestones (auto-enabled for >10s) |
| `commands[].progress_file` | boolean | No | `false` | Stream output to pollable progress file (auto-enabled for >30s) |
| `parallel` | boolean | No | `false` | Run commands in parallel |
| `working_dir` | string | No | - | Global working directory for all commands |
| `timeout_ms` | number | No | `120000` | Global timeout in ms (per-command timeout overrides) |
| `background` | boolean | No | `false` | Run all commands in background |
| `verbosity` | enum | No | `standard` | Response verbosity: `count_only`, `minimal`, `standard`, `verbose` |

*One of `cmd` or `cmd_base64` is required.

---

## `precision_fetch`

Fetch content from URLs with extract modes, auth, and batching.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|---------|---------|-------------|
| `urls` | array | Yes | - | Array of URL objects |
| `urls[].url` | string | Yes | - | URL to fetch |
| `urls[].method` | enum | No | `GET` | HTTP method: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS` |
| `urls[].headers` | object | No | - | HTTP headers |
| `urls[].body` | string | No | - | Request body |
| `urls[].body_base64` | string | No | - | Base64-encoded request body |
| `urls[].body_data` | any | No | - | Body data to encode (object for json/form/multipart, string for raw) |
| `urls[].body_type` | enum | No | `json` | Body encoding: `json`, `form`, `multipart`, `raw` |
| `urls[].service` | string | No | - | Service name from registry (for auto-auth) |
| `urls[].auth` | object | No | - | Per-request auth override |
| `urls[].auth.type` | enum | No | - | Auth type: `none`, `bearer`, `basic`, `api-key`, `custom-headers` |
| `urls[].auth.token` | string | No | - | Bearer token |
| `urls[].auth.username` | string | No | - | Basic auth username |
| `urls[].auth.password` | string | No | - | Basic auth password |
| `urls[].auth.key` | string | No | - | API key value |
| `urls[].auth.header` | string | No | - | API key header name |
| `urls[].auth.headers` | object | No | - | Custom auth headers |
| `urls[].params` | object | No | - | Query parameters (key-value pairs) |
| `urls[].extract` | enum | No | `text` | Extract mode: `raw`, `text`, `json`, `markdown`, `structured`, `summary`, `code_blocks`, `tables`, `links`, `metadata`, `readable`, `pdf` |
| `urls[].selectors` | array | No | - | CSS selectors for structured extraction |
| `urls[].timeout_ms` | number | No | `30000` | Request timeout |
| `extract` | enum | No | `text` | Global extract mode (per-URL extract overrides) |
| `parallel` | boolean | No | `true` | Fetch URLs in parallel |
| `verbosity` | enum | No | `standard` | Response verbosity: `count_only`, `minimal`, `standard`, `verbose` |

---

## `discover`

Meta-tool that runs multiple queries (grep, glob, symbols, structural) in parallel.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|---------|---------|-------------|
| `queries` | array | Yes | - | Array of query objects |
| `queries[].id` | string | Yes | - | Query identifier |
| `queries[].type` | enum | Yes | - | Query type: `grep`, `glob`, `symbols`, `structural` |
| `queries[].pattern` | string | Yes* | - | Pattern (for grep queries) |
| `queries[].pattern_base64` | string | Yes* | - | Base64-encoded pattern (for grep queries) |
| `queries[].patterns` | array | Yes* | - | Patterns (for glob queries) |
| `queries[].patterns_base64` | array | Yes* | - | Base64-encoded patterns (for glob queries) |
| `queries[].query` | string | Yes* | - | Symbol query (for symbols queries) |
| `queries[].structural_pattern` | string | Yes* | - | AST pattern (for structural queries) |
| `queries[].structural_pattern_base64` | string | Yes* | - | Base64-encoded AST pattern (for structural queries) |
| `queries[].glob` | string | No | - | File glob pattern (for grep queries) |
| `queries[].kinds` | array | No | - | Symbol kinds (for symbols queries) |
| `queries[].language` | string | No | - | Language hint for structural queries |
| `base_path` | string | No | cwd | Base directory for all searches |
| `verbosity` | enum | No | `files_only` | Output verbosity: `count_only`, `files_only`, `locations` |

*Required based on query type.

---

## `precision_symbols`

Extract symbols (types, functions, variables) from code files.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|---------|---------|-------------|
| `mode` | enum | No | `workspace` | Extraction mode: `workspace`, `document` |
| `query` | string | No | - | Filter symbols by name (partial match) |
| `files` | array | No* | - | Specific files to extract from (document mode) |
| `kinds` | array | No | - | Filter by kind: `function`, `method`, `class`, `interface`, `type`, `variable`, `constant`, `enum`, `property`, `namespace` |
| `exported_only` | boolean | No | `false` | Only exported symbols |
| `include_private` | boolean | No | `false` | Include private symbols |
| `language` | enum | No | `auto` | Language: `auto`, `typescript`, `python`, `rust`, `go` |
| `output` | object | No | - | Output formatting options |
| `output.format` | enum | No | `locations` | Format: `count_only`, `names_only`, `locations`, `signatures`, `full` |
| `output.group_by` | enum | No | `none` | Group by: `file`, `kind`, `none` |
| `output.max_results` | number | No | `100` | Max symbols to return |
| `output.max_tokens` | number | No | - | Hard token cap |
| `verbosity` | enum | No | `locations` | Response verbosity: `count_only`, `names_only`, `locations`, `signatures`, `full` |

*`files` required for `document` mode.

---

## `precision_notebook`

Edit Jupyter notebook cells.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|---------|---------|-------------|
| `path` | string | Yes | - | Path to .ipynb file |
| `operations` | array | Yes | - | Array of operation objects |
| `operations[].op` | enum | Yes | - | Operation type: `replace`, `insert`, `delete` |
| `operations[].cell_id` | string | No* | - | Cell ID to target (from metadata) |
| `operations[].cell` | number | No* | - | Cell index (0-based) |
| `operations[].after` | number | No | - | Insert after this cell index (-1 for beginning) |
| `operations[].cell_type` | enum | No | - | Cell type: `code`, `markdown`, `raw` |
| `operations[].source` | string | No | - | New cell source content |
| `operations[].clear_outputs` | boolean | No | `false` | Clear cell outputs on replace |
| `verbosity` | enum | No | `standard` | Response verbosity: `count_only`, `minimal`, `standard`, `verbose` |

*One of `cell_id`, `cell`, or `after` is required based on operation type.

---

## `precision_config`

Read and update GoodVibes precision engine configuration.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|---------|---------|-------------|
| `action` | enum | Yes | - | Action: `get`, `set`, `reload` |
| `key` | string | No | - | Config key to get/set (omit for get to return all config) |
| `value` | any | No | - | Value to set (for `set` action) |

### Config Keys

Available keys: `sandbox`, `cache_mode`, `cache_max_mb`, `safe_overwrite`, `backup_dir`, `backup_git_clean_skip`, `slow_fs_stat_threshold_ms`, `slow_fs_known_prefixes`, `max_file_bytes`, `max_token_estimate`, `max_diff_chars`, `page_size_lines`, `verbosity_defaults`, `exec_max_output_chars`, `exec_default_timeout_ms`, `exec_max_output_lines`, `exec_overflow_dir`, `exec_max_background`, `exec_history_max`, `discover_symbol_timeout_ms`, `fetch.services` (virtual - returns list), `fetch.auth_status` (virtual - returns auth status).

---

## Quick Reference Table

| Tool | Primary Use Case | Key Parameters |
|------|------------------|----------------|
| `precision_read` | Read files with extract modes | `files`, `extract`, `verbosity` |
| `precision_write` | Create or overwrite files | `files`, `mode`, `verbosity: count_only` |
| `precision_edit` | Atomic find-and-replace | `edits`, `transaction.mode`, `verbosity: minimal` |
| `precision_grep` | Search for patterns | `queries`, `output.format`, `verbosity` |
| `precision_glob` | Find files by pattern | `patterns`, `output.format: paths_only` |
| `precision_exec` | Run commands with expectations | `commands`, `expect`, `retry.max` |
| `precision_fetch` | Fetch URLs with auth | `urls`, `service`, `extract` |
| `discover` | Parallel discovery queries | `queries`, `verbosity: files_only` |
| `precision_symbols` | Extract code symbols | `mode`, `kinds`, `output.format: locations` |
| `precision_notebook` | Edit Jupyter cells | `path`, `operations` |
| `precision_config` | Manage configuration | `action`, `key`, `value` |
