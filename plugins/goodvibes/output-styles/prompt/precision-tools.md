## Precision Engine Tools

Use precision_engine tools instead of native tools (Read, Edit, Write, Glob, Grep, WebFetch).
WebSearch has no precision equivalent — use it directly.

### Output Verbosity Defaults

Set verbosity per operation type to minimize tokens in main conversation:

| Operation | Default Verbosity | Why |
|-----------|------------------|-----|
| Write | count_only | You provided the content; just confirm success |
| Edit | minimal | Confirm applied; skip diffs unless debugging |
| Read | standard | You need the content |
| Grep | files_only for discovery, matches when content needed | Two common use cases |
| Glob | paths_only via output.format | You need file paths, not stats |
| Exec | minimal | Unless you need stdout/stderr |
| Fetch | standard | You need the content |
| Discover | files_only | Discovery phase, not content phase |
| Symbols | locations | File:line is usually enough |

Escalate verbosity only when debugging a failed operation or verifying unexpected results.

### Tool Quick Reference

precision_read:
  files: [{path, extract?, range?: {start, end}, force?}]
  extract: content | outline | symbols | ast | lines
  output.format: count_only | minimal | standard | verbose
  output: max_per_item, max_tokens, token_budget (pagination)
  Reads: files, images (visual), PDFs (pages param), notebooks (.ipynb)

precision_edit:
  edits: [{path, find, replace, occurrence?, hints?: {near_line, in_function, in_class}}]
  match.mode: exact | fuzzy | regex | ast (default: exact)
  transaction.mode: atomic | partial | none (default: atomic, rollback on fail)
  output.format: count_only | minimal | with_diff | verbose
  validate.after: [typecheck, lint, test, build]
  Use find_base64/replace_base64 when content has single quotes, backticks, or ${}

precision_write:
  files: [{path, content, mode?: fail_if_exists | overwrite | backup}]
  Auto-creates parent directories
  Use content_base64 for single quotes, backticks, or ${}

precision_glob:
  patterns: ["**/*.ts"], exclude?: ["**/node_modules/**"], base_path?
  output.format: count_only | paths_only | with_stats | with_preview
  filters: {min_size, max_size, modified_after, modified_before, has_content}
  respect_gitignore: true (default)

precision_grep:
  queries: [{id, pattern, glob?, path?, case_sensitive?, whole_word?, multiline?, negate?}]
  output.format: count_only | files_only | locations | matches | context | stats
  output: context_before, context_after, expand_to (line | block | function | class)
  output: max_results, max_per_item, max_total_matches, max_tokens

precision_exec:
  commands: [{cmd, cwd?, timeout_ms?, env?, expect?: {exit_code, stdout_contains}}]
  parallel: true | false
  background: true for long-running (manage with bg_status, bg_output, bg_stop)
  retry: {max, delay_ms, backoff: fixed | exponential, on: [network, lock, busy]}
  until: {pattern, timeout_ms} for early termination on pattern match

precision_fetch:
  urls: [{url, method?, extract?, headers?, body?, auth?, params?}]
  extract: raw | text | json | markdown | readable | summary | code_blocks | tables | links | metadata | pdf
  auth: {type: bearer | basic | api-key, token / username+password / header+key}
  body_data + body_type (json | form | multipart | raw) for POST/PUT

discover:
  queries: [{id, type: grep | glob | symbols | structural, pattern/patterns/query}]
  Runs multiple queries in parallel. Use for batch discovery before operations.

precision_symbols:
  mode: workspace | document, query?, files?, kinds?, language?
  output.format: count_only | names_only | locations | signatures | full

precision_notebook:
  path, operations: [{op: replace | insert | delete, cell/cell_id, source?, cell_type?}]

precision_config:
  action: get | set | reload, key?, value?
  Useful keys: sandbox, cache_mode, verbosity_defaults, exec_default_timeout_ms
